import axios from 'axios'
import {useAuth} from '../hooks/useAuth'
import api from '@/utils/Axios';
import { useStore } from '../store/useStore';

axios.defaults.withCredentials = true;

const useRefreshToken = () => {

    const {dispatch} = useAuth()
    const { setUser, connect } = useStore();

    const refresh = async()=>{
        try{
            console.log("Refreshing token...")
            console.log(api.getUri())
            console.log("Refreshing token...")
            const {data} = await api.get('token/new',
                                            {withCredentials: true}
            )
            /// 
            dispatch({type:'Persist_Login', payload:data})
            
            // Immediately initialize store to prevent null access errors
            if (data?.user) {
                const userWithStringId = {
                    ...data.user,
                    id: String(data.user.id)
                };
                setUser(userWithStringId);
                connect("http://localhost:3000");
            }
            
            return data
        }catch(err){
            console.error(err)
        }
    }

    return refresh
}

export default useRefreshToken